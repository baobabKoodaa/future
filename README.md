# WeChatGPT+

A dystopic text adventure powered by GPT-3.

Try it here: [https://future.attejuvonen.fi](https://future.attejuvonen.fi)

### Dev

1. Set up environment variables
    - OPENAI_API_KEY
    - LOG_ENDPOINT

2. Run server.js with node v17

3. Open http://localhost:3000

### Deployment

This repo has been set up to automatically deploy upon pushes to the master branch:
- Fly.io NodeJS backend deployment (which also serves static frontend if needed)
- Netlify static frontend deployment