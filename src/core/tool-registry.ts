import { CallToolRequestSchema, ListToolsRequestSchema, Tool as MCPTool } from "@modelcontextprotocol/sdk/types.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

export interface Tool<T = any> {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: Record<string, any>;
        required?: string[];
    };
    handler: (args: T) => Promise<any>;
    formatter: (result: any) => string;
}

export class ToolRegistry {
    private tools: Map<string, Tool> = new Map();

    register(tool: Tool) {
        if (this.tools.has(tool.name)) {
            throw new Error(`Tool ${tool.name} is already registered`);
        }
        this.tools.set(tool.name, tool);
    }

    getTools(): MCPTool[] {
        return Array.from(this.tools.values()).map(tool => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema
        }));
    }

    async handleRequest(name: string, args: any): Promise<{ content: { type: "text", text: string }[], isError?: boolean }> {
        const tool = this.tools.get(name);
        if (!tool) {
            throw new Error(`Unknown tool: ${name}`);
        }

        try {
            const result = await tool.handler(args);
            const response = { content: [{ type: "text" as const, text: tool.formatter(result) }] };
            return response;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const response = {
                content: [{ type: "text" as const, text: `❌ Error: ${errorMessage}` }],
                isError: true
            };
            return response;
        }
    }

    applyTo(server: Server) {
        server.setRequestHandler(ListToolsRequestSchema, async () => {
            return { tools: this.getTools() };
        });

        server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            return this.handleRequest(name, args);
        });
    }
}
