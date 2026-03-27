# outsidevisual-maintenance

Percy visual regression snapshots for client sites.

## Setup

```bash
cp .env.example .env
# Add your PERCY_TOKEN to .env
npm install
```

## Usage

1. Export your Percy token for the project you're running:
```bash
export PERCY_TOKEN=your_percy_token_here
```

2. Run snapshots:
```bash
npm run snap:royalmtLive
npm run snap:royalmtSTG
npm run snap:lindauer
```

## Adding a new project

1. Add the project config to `config/projects.js`
2. Add its pages to `config/pages.js`
3. Add an npm script shortcut to `package.json`

## Structure

```
├── config/
│   ├── projects.js   # Project names and base URLs
│   └── pages.js      # Pages to snapshot per project
├── snapshots.js      # Main runner
├── .env              # Your PERCY_TOKEN (never commit this)
└── .env.example      # Safe to commit
```