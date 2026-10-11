import os

# Must run before anything imports app.config, which reads env vars at module load.
os.environ.setdefault("GEMINI_API_KEY", "test-key")
