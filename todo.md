## current goal: model choice, tools, and DB
- [x] validation schema of model lists in ./src/types/schemas.ts using zod (basic compile-time validation for now)
    - [x] partially updated generateContent.ts for basic checks like file inputs and tools
    - [ ] iterate thru ./src/data/models.json with model chosen from `/model set` command and validate using zod runtime validation and existence of the model
    - [ ] tool use
- [x] models.json in ./src/data/models.json
- [ ] model choice
    - [ ] `/model set` with autocomplete
    - [ ] populate more models in ./src/data/models.json
- [ ] mongodb