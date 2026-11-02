import {test} from 'node:test';
import assert from 'node:assert/strict';
import {preflight} from '../server/workflow.mjs';
const info={PrimitiveFloat:{input:{required:{value:['FLOAT',{}]}}},ComfyMathExpression:{input:{required:{expression:['STRING',{default:'a+b'}],values:['COMFY_AUTOGROW_V3',{template:{names:['a','b'],min:1,input:{required:{value:['FLOAT,INT,BOOLEAN',{}]}}}}]}}}};
function graph(inputs){return {'1':{class_type:'PrimitiveFloat',inputs:{value:5}},'2':{class_type:'ComfyMathExpression',inputs:{expression:'a+1',...inputs}}};}
test('ComfyUI autogrow values.a satisfies its required values group',()=>{assert.deepEqual(preflight(graph({'values.a':['1',0]}),info),{ready:true,errors:[]});});
test('autogrow group still rejects missing or unrecognized dynamic inputs',()=>{assert.equal(preflight(graph({}),info).ready,false);assert.equal(preflight(graph({'values.unknown':['1',0]}),info).ready,false);});
