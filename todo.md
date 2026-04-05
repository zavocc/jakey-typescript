## current goal: tools, agentic interfaces, and DB
- [x] validation schema of model lists in ./src/types/schemas.ts using zod 
    - [ ] chat history per provider
- [ ] tool use
    - [ ] builtin tools
    - [ ] pass discord context and bot to functions
- [ ] mongodb indexing
- [ ] better logging, especially in lib/services

- [x] separate generateContent.ts as a sole utility functions that takes prompt, file inputs, and possibly messages array
- [x] agentic interface and multi-part multimodal outputs must be in separate files e.g. llmAgenticReciever.ts where functions can take Discord.JS's Interaction (type `Message`) object as parameter so the agentic reciever function can still send messages or perform actions like react message
    - [ ] the chatLLM.ts event also focus more on showing agentic tools and multimodal result
        call chain are: User -> chatLLM.ts -> AgenticReciever -> generateContent.ts -> Report back to agenticReciever and send message text or perform tool call loops -> Send message back to chatLLM.ts

and most importantly, find and resolve //TODOs