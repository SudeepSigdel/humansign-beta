from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):

    max_file_size: int
    allowed_doc_types: set
    humansign_extension: str

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )

settings = Settings() #type: ignore