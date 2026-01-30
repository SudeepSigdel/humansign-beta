from fastapi import APIRouter, File, UploadFile, HTTPException, status
from app.core.config import settings
from app.pipeline.pipeline import process_session
from app.schemas.verification import VerificationResponse
from app.services.events import flatten_chain, verify_chain
from app.services.ml import run_model
from app.services.parser import read_humansign_file, extract_jws, basic_jws_sanity_check
from app.services.crypto import verify_jws_signature
from app.services.hash import compute_sha256

router = APIRouter(
    prefix="/verify",
    tags=['Take file input and verify']
)

@router.post("/", response_model=VerificationResponse)
async def verify_files(document: UploadFile = File(...), humansign: UploadFile = File(...)):
    if not document or not humansign:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Both document and humansign files are required!")

    if document.content_type not in settings.allowed_doc_types:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Unsupported document type")
    
    if not humansign.filename.endswith(settings.humansign_extension): #type: ignore =>because we already explicitly checked the existence of the humansign file
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Invalid humansign file")
    
    async def get_file_size(file: UploadFile):
        contents =await file.read()
        size = len(contents)
        await file.seek(0)
        return size
    
    doc_size = await get_file_size(document)
    hs_size = await get_file_size(humansign)
    
    if doc_size>settings.max_file_size or hs_size> settings.max_file_size:
        raise HTTPException(status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail="File size exceeds limit")
    
    raw_humansign = await read_humansign_file(humansign)
    jws_token = extract_jws(raw_humansign)
    basic_jws_sanity_check(jws_token)

    verified_payload = verify_jws_signature(jws_token)

    stored_hash = verified_payload.get("document_hash")

    if not stored_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid HumanSign Payload: missing document hash"
        )

    computed_hash = await compute_sha256(document)

    if computed_hash != stored_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PROOF FAILED: Document was modified after sealing"
        )
    
    chain = verified_payload.get("chain")
    if not chain:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing event chain")
    
    verify_chain(chain)
    
    events = flatten_chain(chain)
    features = process_session(
        events=events,
        subject=verified_payload["subject"],
        session_index=verified_payload["sessionIndex"],
        rep=verified_payload.get("rep")
    )

    authorship = run_model(features)

    return{
        "status": "VERIFIED",
        "integrity": {
            "signature_valid": True,
            "hash_match": True
        },
        "authorship": authorship
    }