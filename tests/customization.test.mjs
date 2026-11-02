import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cpuPercent,parseGpus} from '../server/monitor.mjs';
import {buildWorkflow} from '../server/workflow.mjs';
test('resource samples use interval CPU deltas and preserve unsupported GPU values',()=>{assert.equal(cpuPercent({idle:100,total:200},{idle:125,total:300}),75);assert.equal(cpuPercent({idle:1,total:1},{idle:1,total:1}),null);const [gpu]=parseGpus('0, Test GPU, 45, 1024, 8192, [N/A]');assert.equal(gpu.utilization,45);assert.equal(gpu.memoryUsedMB,1024);assert.equal(gpu.temperatureC,null);});
test('selected camera direction is included in the actual video conditioning prompt',()=>{const graph=buildWorkflow({prompt:'A cat',duration:5,camera:'特写、环绕镜头'},{id:'test',aspectRatio:'16:9',megapixels:0.5});assert.ok(JSON.stringify(graph).includes('Camera direction / 镜头语言: 特写、环绕镜头'));});
