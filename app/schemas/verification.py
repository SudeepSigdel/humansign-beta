from pydantic import BaseModel

class Integrity(BaseModel):
    signature_valid: bool
    hash_match: bool

class Authorship(BaseModel):
    organic_human: float
    ai_assisted: float
    pasted: float

class VerificationResponse(BaseModel):
    status: str
    integrity: Integrity
    authorship: Authorship


class VerifiedBlock(BaseModel):
    start_ts: int
    end_ts: int
    events: list[list[int | str]]
    prev_hash: str
    block_hash: str


class VerifiedSession(BaseModel):
    subject: str
    sessionIndex: int
    rep: int
    document_hash: str
    events: list[tuple[int, str]]  # flattened & ordered
