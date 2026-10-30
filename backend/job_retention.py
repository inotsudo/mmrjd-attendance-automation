"""Opt-in pruning helper for explicitly configured job-store retention policies.

This module is intentionally not wired into application startup or request handling.
Callers must supply an owner-approved UTC cutoff and the active job IDs. Dry-run is
the default so importing or invoking the helper without an explicit destructive
choice cannot remove stored attendance data.
"""

from __future__ import annotations

import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Collection


def cleanup_expired_job_directories(
    storage_root: Path | str,
    cutoff: datetime,
    *,
    active_job_ids: Collection[str],
    dry_run: bool = True,
) -> list[str]:
    """Return candidate UUIDs and optionally remove expired, inactive job dirs.

    The caller owns the retention policy and must provide an aware cutoff. Only
    direct, non-symlink UUID directories beneath `storage_root` are considered.
    `active_job_ids` must be supplied by a future job lifecycle/locking mechanism.
    A caller performing deletion must hold a lifecycle lock shared with job
    creation and processing; this helper is not wired into the running API.
    """
    if cutoff.tzinfo is None or cutoff.utcoffset() is None:
        raise ValueError("cutoff must be timezone-aware")

    root = Path(storage_root)
    if root.is_symlink():
        raise ValueError("storage root must not be a symlink")
    root = root.resolve(strict=True)
    if not root.is_dir():
        raise ValueError("storage root must be a directory")

    cutoff_utc = cutoff.astimezone(timezone.utc)
    active = {str(value) for value in active_job_ids}
    candidates: list[str] = []

    for child in root.iterdir():
        if child.is_symlink():
            continue
        try:
            job_id = str(uuid.UUID(child.name))
        except (ValueError, AttributeError):
            continue
        if job_id != child.name or job_id in active or not child.is_dir():
            continue

        try:
            resolved = child.resolve(strict=True)
            if resolved.parent != root or resolved.is_symlink() or not resolved.is_dir():
                continue
            modified = datetime.fromtimestamp(child.stat(follow_symlinks=False).st_mtime, timezone.utc)
        except (OSError, RuntimeError):
            continue
        if modified >= cutoff_utc:
            continue

        candidates.append(job_id)
        if not dry_run:
            # rmtree does not follow symlink entries; recheck the target directory
            # immediately before removal as an additional guard against swaps.
            if child.is_symlink() or child.resolve(strict=True).parent != root:
                candidates.pop()
                continue
            if not shutil.rmtree.avoids_symlink_attacks:
                candidates.pop()
                raise RuntimeError("safe recursive deletion is unavailable on this platform")
            shutil.rmtree(child)

    return candidates
