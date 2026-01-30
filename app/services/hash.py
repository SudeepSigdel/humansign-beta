import hashlib
from fastapi import UploadFile

async def compute_sha256(file: UploadFile):
    sha256 = hashlib.sha256()

    while chunk := await file.read(8192):
        sha256.update(chunk)

    await file.seek(0)
    return sha256.hexdigest()