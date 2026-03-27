// functions to load and save to json
import fs from 'fs';
import path from 'path';
import type { ModelMessage } from 'ai';

const WORKING_CONTEXT_DIR = path.join(__dirname, '../../../harbour');

export async function loadContext(userId: string): Promise<ModelMessage[]> {
    const filePath = path.join(WORKING_CONTEXT_DIR, `${userId}.json`);
    
    // check if file exists otherwise we return empty array
    if (!fs.existsSync(filePath)) {
        return [];
    }

    const fileContent = await fs.promises.readFile(filePath, 'utf-8');
    try {
        const context = JSON.parse(fileContent) as ModelMessage[];
        return context;
    } catch (error) {
        console.error(`Error parsing context for user ${userId}:`, error);
        return [];
    }
}

export async function saveContext(userId: string, context: ModelMessage[]): Promise<void> {
    const filePath = path.join(WORKING_CONTEXT_DIR, `${userId}.json`);
    try {
        await fs.promises.mkdir(WORKING_CONTEXT_DIR, { recursive: true });
        const stringifiedContent = JSON.stringify(context, null, 2);
        await fs.promises.writeFile(filePath, stringifiedContent, 'utf-8');
    } catch (error) {
        console.error(`Error saving context for user ${userId}:`, error);
    }
}
