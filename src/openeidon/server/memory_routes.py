"""/v1/memory/facts/* routes — structured memory for the FOX sidebar."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from openeidon.memory import get_fact_store

memory_router = APIRouter()


class FactUpsertRequest(BaseModel):
    kind: str
    name: str
    detail: str = ""
    tags: list[str] = []


@memory_router.get("/v1/memory/facts")
async def list_facts(kind: str = "", query: str = ""):
    store = get_fact_store()
    if query:
        facts = await asyncio.to_thread(store.search, query)
    else:
        try:
            facts = await asyncio.to_thread(store.list, kind)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    counts = await asyncio.to_thread(store.counts)
    return {"facts": [f.to_dict() for f in facts], "counts": counts}


@memory_router.get("/v1/memory/facts/counts")
async def fact_counts():
    return await asyncio.to_thread(get_fact_store().counts)


@memory_router.post("/v1/memory/facts")
async def upsert_fact(body: FactUpsertRequest):
    store = get_fact_store()
    try:
        fact = await asyncio.to_thread(
            lambda: store.upsert(
                body.kind, body.name, detail=body.detail, tags=body.tags
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return fact.to_dict()


@memory_router.delete("/v1/memory/facts/{fact_id}")
async def delete_fact(fact_id: str):
    deleted = await asyncio.to_thread(get_fact_store().delete, fact_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"No fact with id {fact_id}")
    return {"ok": True}
