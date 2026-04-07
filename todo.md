## current goal: tools, agentic interfaces, and DB
- [x] validation schema of model lists in ./src/types/schemas.ts using zod 
    - [x] chat history per provider
- [ ] tool use
    - [x] builtin tools
    - [x] pass discord context and bot to functions
    - [x] more structured polish of how tools are organized (builtin vs apis), gatherer central maybe?
    AS OF 4/5/2026: THIS WORKS WITH FULL Message.channel.send BUT half-baked, only few set of built in tools that cannot be disabled    
    And it's only built-in, but enable_tools toggle works
    - [ ] Send all possible content (text, image) from toolHasFinished loop accessing response.modelResponse content and send it to Discord UI from the chatAgenticReciever, and also avoid dups, we need to make sure loop logic is handled correctly
    - [ ] /tools set command

Also
Avoid DRY code of this snippet:
```
const messageChannel: SendableChannels | null = discord_interaction.channel?.isSendable() ? discord_interaction.channel : null;
  if (!messageChannel) {
    throw new Error("Message channel is not available.");
  }
```
as currently the test tools have these code separately

To implement tool switching, we create a function called `fetchToolSchemaFunctions`

- [ ] mongodb indexing
- [ ] better logging, especially in lib/services

- [ ] When model is removed from models.json, add checks at inference-time (maybe in `modelsSelection.ts`) to see if the model alias exists in `models.json` otherwise throw an error

- [x] separate generateContent.ts as a sole utility functions that takes prompt, file inputs, and possibly messages array
- [x] agentic interface and multi-part multimodal outputs must be in separate files e.g. llmAgenticReciever.ts where functions can take Discord.JS's Interaction (type `Message`) object as parameter so the agentic reciever function can still send messages or perform actions like react message
    - [ ] the chatLLM.ts event also focus more on showing agentic tools and multimodal result
        call chain are: User -> chatLLM.ts -> AgenticReciever -> generateContent.ts -> Report back to agenticReciever and send message text or perform tool call loops -> Send message back to chatLLM.ts

- [x] Implement jsonConfigReader in preferencesLoader instead of directly importing it
  4/7/2026: Implemented thru src/lib/preferencesDBLoader.ts

and most importantly, find and resolve //TODOs