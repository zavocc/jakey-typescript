## current goal: model choice, tools, and DB
- [x] validation schema of model lists in ./src/types/schemas.ts using zod (basic compile-time validation for now)
    - [x] partially updated generateContent.ts for basic checks like file inputs and tools
    - [ ] iterate thru ./src/data/models.json with model chosen from `/model set` command and validate using zod runtime validation and existence of the model
    - [ ] tool use
- [x] models.json in ./src/data/models.json
- [ ] model choice
    - [ ] `/model set` with autocomplete
    - [ ] populate more models in ./src/data/models.json
- [x] mongodb
    it works as of 3/31/2026... connection
    - [ ] make sure loading and saving works
        - [ ] 3/31/2026: contextMemory implemented from json to mongodb of saving and loading context, saving it works but loading fails as it gives me invalid  input of ModelMessages in generateText messages parameter
            PROPOSED FIX: Remove providerOptions metadata OR switch to OpenRouter/OpenAI API
    - [ ] centralize mongodb from lib/db as a service in lib/services with standardized functions

- [ ] instead of importing models.json, we open it every time for autocomplete

and most importantly, find and resolve //TODOs