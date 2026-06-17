# AI Marketing Automation System — Phase 2 MVP

## What this is
Content Agent + QA Agent pipeline. Give it a topic, get back platform-ready drafts.

## Project structure
```
marketing-agent/
├── README.md
├── .env.example          # copy to .env and fill in your keys
├── requirements.txt
├── setup_db.py           # run once to create Supabase tables
├── agents/
│   ├── content_agent.py  # generates drafts per platform
│   └── qa_agent.py       # checks tone, brand safety, fact signals
├── config/
│   └── brand_voice.py    # your lab's brand voice — edit this
└── run.py                # main entry point
```

## Setup
```bash
pip install -r requirements.txt
cp .env.example .env
# fill in ANTHROPIC_API_KEY and SUPABASE_URL + SUPABASE_KEY
python setup_db.py   # creates tables in Supabase
python run.py        # run with a test topic
```
