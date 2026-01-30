from jose import jwt, JWTError
from fastapi import HTTPException, status
from pathlib import Path

PUBLIC_KEY_PATH = Path("app/core/keys/public.pem")

def verify_jws_signature(jws_token: str):
    try:
        public_key = PUBLIC_KEY_PATH.read_text()

        payload = jwt.decode(
            jws_token,
            public_key,
            algorithms=["RS256"]
        )

        return payload
    
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PROOF FAILED: HumanSign file has been tampered with"
        )