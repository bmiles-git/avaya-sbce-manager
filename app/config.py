from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite:///./data/sbce_manager.db"
    secret_key: str = "change-me-in-production"
    encryption_key: str = "change-me-in-production-32bytes!!"
    entra_client_id: str = ""
    entra_client_secret: str = ""
    entra_tenant_id: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
