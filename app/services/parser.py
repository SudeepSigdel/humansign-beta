import json
from fastapi import HTTPException, status

async def read_humansign_file(file):
    try:
        raw_bytes = await file.read()
        await file.seek(0)

        if not raw_bytes:
            raise ValueError("Empty humansign file")

        raw_text = raw_bytes.decode("utf-8")

        return raw_text

    except UnicodeDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="HumanSign file must be UTF-8 encoded"
        )
    
def extract_jws(raw_text: str) -> str:
    raw_text = raw_text.strip()

    if raw_text.count(".") == 2:
        return raw_text

    try:
        data = json.loads(raw_text)
        if "jws" not in data:
            raise ValueError("Missing JWS field")
        return data["jws"]

    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid HumanSign format"
        )

def basic_jws_sanity_check(jws: str):
    parts = jws.split(".")
    if len(parts) != 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Malformed JWS structure"
        )