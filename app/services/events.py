import hashlib
import json
from fastapi import HTTPException

def verify_chain(chain: list):
    previous_hash = "GENESIS"

    for index, block in enumerate(chain):
        events = block.get("events")
        prev_hash = block.get("prev_hash")
        block_hash = block.get("block_hash")

        if not events or not prev_hash or not block_hash:
            raise HTTPException(
                400,
                f"Invalid chain structure at block {index}"
            )

        # Check linkage
        if prev_hash != previous_hash:
            raise HTTPException(
                400,
                f"Chain broken at block {index}"
            )

        # Recompute hash
        payload = json.dumps(events, sort_keys=True).encode()
        recomputed_hash = hashlib.sha256(
            prev_hash.encode() + payload
        ).hexdigest()

        if recomputed_hash != block_hash:
            raise HTTPException(
                400,
                f"Chain tampered at block {index}"
            )

        previous_hash = block_hash


def flatten_chain(chain: list) -> list:
    events = []
    for block in chain:
        events.extend(block.get("events", []))
    return events