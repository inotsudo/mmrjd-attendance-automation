import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

import main


class SyntheticFile:
    def __init__(self, content=None, fail=False):
        self.content = content or b""
        self.fail = fail
        self.requested = []

    async def read(self, size=-1):
        self.requested.append(size)
        if self.fail:
            raise OSError("synthetic interrupted upload")
        data, self.content = self.content[:size], self.content[size:]
        return data

    async def close(self):
        return None


class UploadBoundsTests(unittest.TestCase):
    def test_read_is_bounded_to_limit_plus_one_byte(self):
        source = SyntheticFile(b"12345")
        content = asyncio.run(main.read_upload_bounded(source, 5, "too large"))
        self.assertEqual(content, b"12345")
        self.assertEqual(source.requested, [6])
        with self.assertRaises(HTTPException) as caught:
            asyncio.run(main.read_upload_bounded(SyntheticFile(b"123456"), 5, "too large"))
        self.assertEqual(caught.exception.status_code, 413)

    def test_interrupted_upload_has_actionable_client_error(self):
        with self.assertRaises(HTTPException) as caught:
            asyncio.run(main.read_upload_bounded(SyntheticFile(fail=True), 10, "too large"))
        self.assertEqual(caught.exception.status_code, 400)
        self.assertIn("interrupted", caught.exception.detail)

    def test_concurrent_bounded_reads_do_not_share_buffer_state(self):
        async def run():
            files = [SyntheticFile(b"synthetic-a"), SyntheticFile(b"synthetic-b")]
            return await asyncio.gather(*(main.read_upload_bounded(file, 20, "too large") for file in files))
        self.assertEqual(asyncio.run(run()), [b"synthetic-a", b"synthetic-b"])

    def test_failed_parse_removes_new_job_directory_and_source(self):
        with tempfile.TemporaryDirectory(prefix="synthetic-upload-cleanup-") as temp:
            old_root = main.TEMP_DIR
            main.TEMP_DIR = Path(temp)
            try:
                upload = SyntheticFile(b"synthetic", fail=False)
                upload.filename = "synthetic.csv"
                before = set(Path(temp).iterdir())
                with patch.object(main, "detect_ivms_format", side_effect=HTTPException(status_code=400, detail="synthetic parse failure")):
                    with self.assertRaises(HTTPException):
                        asyncio.run(main.upload_file(upload))
                self.assertEqual(set(Path(temp).iterdir()), before)
            finally:
                main.TEMP_DIR = old_root


if __name__ == "__main__":
    unittest.main()
