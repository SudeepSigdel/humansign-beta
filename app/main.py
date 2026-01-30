from fastapi import FastAPI
from app.api import verify

app = FastAPI(
    title="HumanSign Decoder API",
    version="1.0"
)

app.include_router(verify.router)