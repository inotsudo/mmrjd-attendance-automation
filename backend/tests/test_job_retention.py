import os
import tempfile
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from job_retention import cleanup_expired_job_directories


class JobRetentionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="synthetic-retention-")
        self.root = Path(self.temp.name) / "jobs"
        self.root.mkdir()
        self.now = datetime.now(timezone.utc)
        self.cutoff = self.now - timedelta(days=10)

    def tearDown(self):
        self.temp.cleanup()

    def make_job(self, *, modified: datetime, job_id: str | None = None) -> Path:
        path = self.root / (job_id or str(uuid.uuid4()))
        path.mkdir()
        timestamp = modified.timestamp()
        os.utime(path, (timestamp, timestamp))
        return path

    def test_dry_run_lists_expired_only_and_deletes_nothing(self):
        expired = self.make_job(modified=self.cutoff - timedelta(hours=1))
        self.make_job(modified=self.now - timedelta(days=1))
        result = cleanup_expired_job_directories(self.root, self.cutoff, active_job_ids=set())
        self.assertEqual(result, [expired.name])
        self.assertTrue(expired.exists())

    def test_unexpired_active_malformed_and_out_of_root_paths_are_skipped(self):
        active = self.make_job(modified=self.cutoff - timedelta(days=1))
        fresh = self.make_job(modified=self.now)
        malformed = self.make_job(modified=self.cutoff - timedelta(days=20), job_id="not-a-job-id")
        outside = Path(self.temp.name) / "outside"
        outside.mkdir()
        (outside / "synthetic.txt").write_text("synthetic only")
        link = self.root / str(uuid.uuid4())
        link.symlink_to(outside, target_is_directory=True)

        result = cleanup_expired_job_directories(self.root, self.cutoff, active_job_ids={active.name})
        self.assertEqual(result, [])
        self.assertTrue(active.exists())
        self.assertTrue(fresh.exists())
        self.assertTrue(malformed.exists())
        self.assertTrue((outside / "synthetic.txt").exists())
        self.assertTrue(link.is_symlink())

    def test_explicit_delete_removes_expired_job_but_never_follows_external_symlink(self):
        expired = self.make_job(modified=self.cutoff - timedelta(days=1))
        outside = Path(self.temp.name) / "outside"
        outside.mkdir()
        (outside / "keep.txt").write_text("keep")
        link = self.root / str(uuid.uuid4())
        link.symlink_to(outside, target_is_directory=True)

        result = cleanup_expired_job_directories(self.root, self.cutoff, active_job_ids=set(), dry_run=False)
        self.assertEqual(result, [expired.name])
        self.assertFalse(expired.exists())
        self.assertTrue((outside / "keep.txt").exists())
        self.assertTrue(link.is_symlink())

    def test_requires_aware_cutoff_and_non_symlink_storage_root(self):
        with self.assertRaisesRegex(ValueError, "timezone-aware"):
            cleanup_expired_job_directories(self.root, datetime.now(), active_job_ids=set())
        root_link = Path(self.temp.name) / "jobs-link"
        root_link.symlink_to(self.root, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "must not be a symlink"):
            cleanup_expired_job_directories(root_link, self.cutoff, active_job_ids=set())


if __name__ == "__main__":
    unittest.main()
