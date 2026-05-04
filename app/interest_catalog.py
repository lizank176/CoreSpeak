"""
Intereses cerrados (multicheckbox) para el perfil.

- Guardamos lista de IDs estables (`interests_json`) en cliente/BD.
- Para la IA y el contenido EN del reto solo usamos texto en inglés (`en_for_ai`).
- Las etiquetas `labels` alimentan el formulario según idioma UI (es/en/fr/uk).
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass


def _strip_accents(value: str) -> str:
    nf = unicodedata.normalize("NFKD", value or "")
    return "".join(ch for ch in nf if unicodedata.category(ch) != "Mn")


_FOLD_WS = re.compile(r"\s+")
_NON_ALNUM = re.compile(r"[^a-z0-9\s]+")


def _norm_slug(value: str) -> str:
    raw = _strip_accents((value or "").strip().lower())
    raw = _NON_ALNUM.sub(" ", raw)
    return _FOLD_WS.sub("_", raw).strip("_")


@dataclass(frozen=True)
class InterestChoice:
    id: str
    en_for_ai: str
    labels: dict[str, str]


INTEREST_CHOICES: tuple[InterestChoice, ...] = (
    InterestChoice(
        "travel",
        "travel and exploring new cultures",
        {
            "es": "Viajes y culturas",
            "en": "Travel & cultures",
            "fr": "Voyages & cultures",
            "uk": "Подорожі та культури",
        },
    ),
    InterestChoice(
        "tech",
        "technology and gadgets",
        {
            "es": "Tecnología y gadgets",
            "en": "Technology & gadgets",
            "fr": "Tech & gadgets",
            "uk": "Техніка та ґаджети",
        },
    ),
    InterestChoice(
        "video_games",
        "video games esports streaming and gaming culture",
        {
            "es": "Videojuegos y streaming",
            "en": "Video games & streaming",
            "fr": "Jeux vidéo & streams",
            "uk": "Відеоігри й стріми",
        },
    ),
    InterestChoice(
        "music",
        "music playlists concerts songwriting",
        {
            "es": "Música en vivo y playlists",
            "en": "Music live & playlists",
            "fr": "Musique live & playlists",
            "uk": "Музика й плейлисти",
        },
    ),
    InterestChoice(
        "cinema",
        "movies and cinema",
        {
            "es": "Cine y películas",
            "en": "Cinema & movies",
            "fr": "Cinéma & films",
            "uk": "Кіно й фільми",
        },
    ),
    InterestChoice(
        "streaming_series",
        "TV series binge watching streaming dramas",
        {
            "es": "Series y plataformas",
            "en": "TV series & streaming",
            "fr": "Séries & streaming",
            "uk": "Серіали та стрімінг",
        },
    ),
    InterestChoice(
        "literature",
        "reading novels poetry book clubs",
        {
            "es": "Literatura y lectura",
            "en": "Reading & literature",
            "fr": "Lecture & littérature",
            "uk": "Читання та література",
        },
    ),
    InterestChoice(
        "art_design",
        "art museums graphic design aesthetics",
        {
            "es": "Arte y diseño",
            "en": "Art & design",
            "fr": "Art & design",
            "uk": "Мистецтво й дизайн",
        },
    ),
    InterestChoice(
        "fitness",
        "running gym yoga wellness",
        {
            "es": "Fitness bienestar",
            "en": "Fitness & wellness",
            "fr": "Fitness & bien-être",
            "uk": "Фітнес і здоров'я",
        },
    ),
    InterestChoice(
        "team_sports",
        "football basketball team sports cheering",
        {
            "es": "Deporte de equipo",
            "en": "Team sports",
            "fr": "Sports collectifs",
            "uk": "Командні види спорту",
        },
    ),
    InterestChoice(
        "cooking",
        "home cooking baking recipes foodie culture",
        {
            "es": "Cocina y gastronomía",
            "en": "Cooking & food",
            "fr": "Cuisine & food",
            "uk": "Кулінарія їжа",
        },
    ),
    InterestChoice(
        "nature_outdoors",
        "hiking camping nature outdoors",
        {
            "es": "Naturaleza y rutas",
            "en": "Nature & hikes",
            "fr": "Nature & rando",
            "uk": "Природа походи",
        },
    ),
    InterestChoice(
        "pets",
        "pets dogs cats volunteering with animals",
        {
            "es": "Mascotas",
            "en": "Pets",
            "fr": "Animaux dom.",
            "uk": "Домашні улюбленці",
        },
    ),
    InterestChoice(
        "stem",
        "science maths engineering curiosity",
        {
            "es": "Ciencia e ingeniería",
            "en": "Science & STEM",
            "fr": "Sciences & tech",
            "uk": "Наука STEM",
        },
    ),
    InterestChoice(
        "career_business",
        "careers startups networking professional growth",
        {
            "es": "Carrera y negocios",
            "en": "Career & business",
            "fr": "Carrière & business",
            "uk": "Кар'єра бізнес",
        },
    ),
    InterestChoice(
        "podcasts_learning",
        "podcasts language learning study habits",
        {
            "es": "Podcasts y aprendizaje",
            "en": "Podcasts & learning",
            "fr": "Podcasts & apprentissage",
            "uk": "Подкасти навчання",
        },
    ),
)

INTEREST_BY_ID: dict[str, InterestChoice] = {c.id: c for c in INTEREST_CHOICES}
ALLOWED_INTEREST_IDS: frozenset[str] = frozenset(INTEREST_BY_ID)

# Texto libre antiguo / sinónimos → ID (tras normalizar slug)
LEGACY_LABEL_TO_ID: dict[str, str] = {}
for choice in INTEREST_CHOICES:
    for lab in choice.labels.values():
        LEGACY_LABEL_TO_ID[_norm_slug(lab)] = choice.id
    LEGACY_LABEL_TO_ID[_norm_slug(choice.id.replace("_", " "))] = choice.id
    LEGACY_LABEL_TO_ID[_norm_slug(choice.en_for_ai)] = choice.id

LEGACY_SYNONYMS: dict[str, str] = {
    "viajes": "travel",
    "viaje": "travel",
    "tecnologia": "tech",
    "gaming": "video_games",
    "games": "video_games",
    "juegos": "video_games",
    "videojuegos": "video_games",
    "musica": "music",
    "movies": "cinema",
    "peliculas": "cinema",
    "netflix": "streaming_series",
    "series": "streaming_series",
    "lectura": "literature",
    "libros": "literature",
    "arte": "art_design",
    "sport": "team_sports",
    "running": "fitness",
    "gym": "fitness",
    "cooking": "cooking",
    "cocina": "cooking",
    "campo": "nature_outdoors",
    "natural": "nature_outdoors",
    "pets": "pets",
    "mascotas": "pets",
    "ciencia": "stem",
    "negocios": "career_business",
    "trabajo": "career_business",
}


def coerce_interests_list(raw: object, *, max_items: int = 10) -> list[str]:
    """
    Lista de IDs canónicos a guardar desde el cliente / migración texto libre.
    """
    picked: list[str] = []

    def push_id(iid: str) -> None:
        iid = (iid or "").strip().lower().replace("-", "_")
        if len(picked) >= max_items:
            return
        if iid in ALLOWED_INTEREST_IDS and iid not in picked:
            picked.append(iid)

    def walk(node: object) -> None:
        if len(picked) >= max_items:
            return
        if node is None:
            return
        if isinstance(node, str):
            s = node.strip()
            if not s:
                return
            if "," in s or ";" in s:
                for part in re.split(r"[,;]", s):
                    walk(part.strip())
                return
            slug = _norm_slug(s.replace("-", "_"))
            if slug in ALLOWED_INTEREST_IDS:
                push_id(slug)
                return
            if slug in LEGACY_SYNONYMS:
                push_id(LEGACY_SYNONYMS[slug])
                return
            if slug in LEGACY_LABEL_TO_ID:
                push_id(LEGACY_LABEL_TO_ID[slug])
                return
            return
        if isinstance(node, dict):
            for k in ("topics", "interests", "items", "tags"):
                if k in node:
                    walk(node[k])
                    return
            for v in node.values():
                if isinstance(v, (str, list, tuple)):
                    walk(v)
            return
        if isinstance(node, Iterable) and not isinstance(node, (str, bytes)):
            for x in node:
                walk(x)

    walk(raw)
    return picked


def interest_options_public_payload() -> list[dict]:
    """JSON para `/api/catalog/interest-options`: sin auth."""
    rows: list[dict] = []
    for choice in INTEREST_CHOICES:
        rows.append({"id": choice.id, "en": choice.en_for_ai, "labels": dict(choice.labels)})
    return rows


def english_for_ai_prompt(interests_storage: object) -> str:
    """Una línea lista para prompts (solo inglés); «modern life» si no hay nada válido."""
    ids = coerce_interests_list(interests_storage, max_items=10)
    if not ids:
        return "modern life"
    return ", ".join(INTEREST_BY_ID[i].en_for_ai for i in ids)


def learner_topics_meaningful(interests_readable: str) -> bool:
    t = (interests_readable or "").strip().lower()
    return bool(t) and t != "modern life"


def first_interest_context_for_challenge_row(interests_storage: object, max_len: int = 180) -> str | None:
    ids = coerce_interests_list(interests_storage, max_items=1)
    if not ids:
        return None
    text = INTEREST_BY_ID[ids[0]].en_for_ai.strip()
    return text[:max_len] if text else None
