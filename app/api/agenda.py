from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field, model_validator
from sqlmodel import Session, select

from app.db import get_session
from app.dependencies import get_current_user
from app.models import AgendaWord, AppUser

router = APIRouter(prefix="/api/agenda", tags=["agenda"])


class AgendaWordOut(BaseModel):
    id: int
    word: str
    meaning: str

    model_config = {"from_attributes": True}


class AgendaWordCreate(BaseModel):
    word: str = Field(default="", max_length=500)
    meaning: str = Field(default="", max_length=4000)

    @model_validator(mode="after")
    def at_least_one_field(self) -> AgendaWordCreate:
        if not (self.word or "").strip() and not (self.meaning or "").strip():
            raise ValueError("Escribe al menos la palabra o el significado.")
        return self


class AgendaWordUpdate(BaseModel):
    word: str = Field(default="", max_length=500)
    meaning: str = Field(default="", max_length=4000)


def _to_out(row: AgendaWord) -> AgendaWordOut:
    return AgendaWordOut(id=row.id or 0, word=row.word or "", meaning=row.meaning or "")


@router.get("/words", response_model=list[AgendaWordOut])
def list_agenda_words(
    user: AppUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[AgendaWordOut]:
    rows = session.exec(
        select(AgendaWord)
        .where(AgendaWord.user_id == user.id)
        .order_by(AgendaWord.created_at.asc())
    ).all()
    return [_to_out(r) for r in rows]


@router.post("/words", response_model=AgendaWordOut, status_code=status.HTTP_201_CREATED)
def create_agenda_word(
    body: AgendaWordCreate,
    user: AppUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> AgendaWordOut:
    w = (body.word or "").strip()
    m = (body.meaning or "").strip()
    now = datetime.utcnow()
    row = AgendaWord(user_id=user.id or 0, word=w, meaning=m, created_at=now, updated_at=now)
    session.add(row)
    session.commit()
    session.refresh(row)
    return _to_out(row)


@router.patch("/words/{word_id}", response_model=AgendaWordOut)
def update_agenda_word(
    word_id: int,
    body: AgendaWordUpdate,
    user: AppUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> AgendaWordOut:
    row = session.get(AgendaWord, word_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Palabra no encontrada")
    row.word = (body.word or "").strip()
    row.meaning = (body.meaning or "").strip()
    row.updated_at = datetime.utcnow()
    session.add(row)
    session.commit()
    session.refresh(row)
    return _to_out(row)


@router.delete("/words/{word_id}")
def delete_agenda_word(
    word_id: int,
    user: AppUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Response:
    row = session.get(AgendaWord, word_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Palabra no encontrada")
    session.delete(row)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
