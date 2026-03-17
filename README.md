# Holacracy Interface

Web-based governance system for holacracy practice.

## Setup

1. Install Python 3.9+
2. Install dependencies:
```
   pip install fastapi uvicorn --break-system-packages
```
3. Create database:
```
   python -c "import sqlite3; conn = sqlite3.connect('holacracy.db'); conn.executescript(open('schema.sql').read()); conn.commit()"
```
4. Run server:
```
   python api.py
```
5. Visit: http://localhost:8000/static/index.html

## Features

- Circle/role structure management
- Governance meetings (Article 3)
- Tactical meetings (Article 4)
- Project tracking
- Policy management
- Constitutional reference

## Philosophy

Minimalist architecture. Constitutional fidelity. Teaching through use.
