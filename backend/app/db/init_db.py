import asyncio

from app.core.database import engine
from app.db.models import Base


async def init_db():
    async with engine.begin() as connection:
        await connection.run_sync(
            Base.metadata.create_all
        )

    print("CIE database initialized.")


if __name__ == "__main__":
    asyncio.run(init_db())

