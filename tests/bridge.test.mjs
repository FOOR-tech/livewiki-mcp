import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'node:http';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {CallToolRequestSchema,ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {parseConfig,credentialFetch} from '../dist/bridge.js';
const env={LIVEWIKI_API_URL:'https://kb.example.test',LIVEWIKI_API_TOKEN:'fixture-secret',LIVEWIKI_TENANT:'acme'};
test('configuration rejects insecure remote URLs and path/credential injection',()=>{
 assert.deepEqual(parseConfig([],env),{baseUrl:'https://kb.example.test',token:'fixture-secret',tenant:'acme'});
 for(const url of ['http://remote.example.test','https://user:secret@kb.example.test','https://kb.example.test/?q=secret','file:///tmp/socket'])assert.throws(()=>parseConfig([],{...env,LIVEWIKI_API_URL:url}));
 assert.throws(()=>parseConfig([],{...env,LIVEWIKI_TENANT:'../../foreign'}));
 assert.throws(()=>parseConfig(['--unknown','a'],env));
});
test('credentials are sent only to the exact configured endpoint with redirects disabled',async()=>{
 let calls=0;
 const guarded=credentialFetch(parseConfig([],env),async(input,init)=>{
  calls++;assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');assert.equal(init.headers.get('Authorization'),'Bearer fixture-secret');
  return new Response('{}');
 });
 await guarded('https://kb.example.test/mcp/acme',{headers:{Authorization:'Bearer attacker'}});
 for(const url of ['https://foreign.example.test/mcp/acme','https://kb.example.test/mcp/other','https://kb.example.test/admin'])await assert.rejects(guarded(url));
 assert.equal(calls,1);
});
test('actual stdio client receives hosted schemas, exact arguments and current permission errors',async()=>{
 const calls=[];let allowed=true;
 const upstream=createServer(async(req,res)=>{
  if(req.headers.authorization!=='Bearer fixture-secret'||req.url!=='/mcp/acme'){res.writeHead(401);res.end();return;}
  const server=new Server({name:'fixture-hosted',version:'1'},{capabilities:{tools:{}}});
  const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined});
  server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:allowed?[{name:'livewiki_search',description:'Current hosted schema',inputSchema:{type:'object',properties:{topic_ids:{type:'array',items:{type:'string'}}}}}]:[]}));
  server.setRequestHandler(CallToolRequestSchema,async(request)=>{
   calls.push(request.params);
   return allowed?{content:[{type:'text',text:'Scoped result'}],structuredContent:{data:[],scope:request.params.arguments?.topic_ids}}:{isError:true,content:[{type:'text',text:'Access revoked'}]};
  });
  res.on('close',()=>{void transport.close();void server.close();});
  try{
   await server.connect(transport);
   let raw='';for await(const chunk of req)raw+=chunk;
   await transport.handleRequest(req,res,raw?JSON.parse(raw):undefined);
  }catch{if(!res.headersSent)res.writeHead(500);res.end();}
 });
 await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
 const client=new Client({name:'desktop-test',version:'1'});
 const transport=new StdioClientTransport({command:process.execPath,args:['dist/cli.js'],env:{...process.env,...env,LIVEWIKI_API_URL:`http://127.0.0.1:${upstream.address().port}`},stderr:'pipe'});
 let stderr='';transport.stderr?.on('data',chunk=>{stderr+=chunk;});
 try{
  await client.connect(transport);
  assert.equal((await client.listTools()).tools[0].description,'Current hosted schema');
  const args={query:'policy',topic_ids:[],idempotency_key:'same-key'};
  const result=await client.callTool({name:'livewiki_search',arguments:args});
  assert.deepEqual(result.structuredContent,{data:[],scope:[]});assert.deepEqual(calls[0].arguments,args);
  allowed=false;
  assert.deepEqual((await client.listTools()).tools,[]);
  assert.equal((await client.callTool({name:'livewiki_search',arguments:args})).isError,true);
  assert.ok(!stderr.includes('fixture-secret'));
 }finally{await client.close();await new Promise(resolve=>upstream.close(resolve));}
});
