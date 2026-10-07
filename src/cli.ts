#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createBridge, parseConfig } from './bridge.js';
if(process.argv.includes('--help')) {
 console.error('LiveWiki MCP desktop bridge\nConfigure LIVEWIKI_API_URL, LIVEWIKI_API_TOKEN, LIVEWIKI_TENANT.\nOptional flags: --base-url URL --tenant WORKSPACE --token TOKEN.\nThe bridge connects to the hosted /mcp/WORKSPACE endpoint and exposes its currently authorized tools.');
 process.exit(0);
}
try {
 const bridge=await createBridge(parseConfig(process.argv.slice(2),process.env));
 process.once('SIGINT',()=>{void bridge.close();});
 process.once('SIGTERM',()=>{void bridge.close();});
 await bridge.server.connect(new StdioServerTransport());
}catch(error){
 // SDK/provider failures may include request headers. Never print the original exception.
 console.error('LiveWiki could not connect. Check the HTTPS API URL, workspace address and current API token. Run --help for configuration.');
 process.exitCode=1;
}
