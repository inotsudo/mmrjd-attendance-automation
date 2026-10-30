import json
import tempfile
import unittest
import uuid
from pathlib import Path

import main
from fastapi import HTTPException


class JobStatusTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="synthetic-job-status-")
        self.original_root = main.TEMP_DIR
        main.TEMP_DIR = Path(self.temp.name)

    def tearDown(self):
        main.TEMP_DIR = self.original_root
        self.temp.cleanup()

    def make_job(self):
        job_id = str(uuid.uuid4())
        folder = main.job_directory(job_id, create=True)
        (folder / "upload.json").write_text(json.dumps({"employee_events": []}), encoding="utf-8")
        return job_id, folder

    def test_missing_job_is_reported_not_assumed_current(self):
        with self.assertRaises(HTTPException) as caught:
            main.get_job_status(str(uuid.uuid4()))
        self.assertEqual(caught.exception.status_code, 404)

    def test_uploaded_job_without_saved_result_is_not_processed(self):
        job_id, _folder = self.make_job()
        status = main.get_job_status(job_id)
        self.assertTrue(status["success"])
        self.assertFalse(status["processed"])
        self.assertIsNone(status["processed_rules_version"])
        self.assertEqual(status["current_rules_version"], main.effective_rules_version(main.BUSINESS_RULES))

    def test_saved_result_provenance_is_reported_for_the_requested_job(self):
        job_id, folder = self.make_job()
        version = main.effective_rules_version(main.BUSINESS_RULES)
        (folder / "processed.json").write_text(json.dumps({"job_id": job_id, "rules_version": version}), encoding="utf-8")
        status = main.get_job_status(job_id)
        self.assertTrue(status["processed"])
        self.assertEqual(status["job_id"], job_id)
        self.assertEqual(status["processed_rules_version"], version)

    def test_result_belonging_to_another_job_is_rejected(self):
        job_id, folder = self.make_job()
        (folder / "processed.json").write_text(json.dumps({"job_id": str(uuid.uuid4()), "rules_version": "rules"}), encoding="utf-8")
        with self.assertRaises(HTTPException) as caught:
            main.get_job_status(job_id)
        self.assertEqual(caught.exception.status_code, 409)

    def test_invalid_job_id_is_rejected(self):
        with self.assertRaises(HTTPException) as caught:
            main.get_job_status("not-a-uuid")
        self.assertEqual(caught.exception.status_code, 400)

    def test_job_directory_symlink_cannot_escape_storage_root(self):
        job_id = str(uuid.uuid4())
        outside = Path(self.temp.name) / "outside"
        outside.mkdir()
        (outside / "upload.json").write_text('{"employee_events": []}', encoding="utf-8")
        (main.TEMP_DIR / job_id).symlink_to(outside, target_is_directory=True)
        with self.assertRaises(HTTPException) as caught:
            main.get_job_status(job_id)
        self.assertEqual(caught.exception.status_code, 409)

    def test_job_json_symlinks_are_rejected(self):
        job_id, folder = self.make_job()
        (folder / "upload.json").unlink()
        for filename, payload in (("upload.json", {"employee_events": []}),
                                  ("processed.json", {"job_id": job_id}),
                                  ("roster.json", {"SYN-1": {"name": "Synthetic"}})):
            outside = Path(self.temp.name) / f"outside-{filename}"
            outside.write_text(json.dumps(payload), encoding="utf-8")
            (folder / filename).symlink_to(outside)
            with self.subTest(filename=filename), self.assertRaises(HTTPException):
                main.read_job_json(job_id, filename)
            (folder / filename).unlink()


if __name__ == "__main__":
    unittest.main()
