export function formatPrompt(value?:string):string;
export function visualDescription(value?:string):string;
export function normalizeShot<T extends {prompt:string;soundMode?:'silent'|'native'}>(shot:T):T&{prompt:string;soundMode:'silent'|'native'};
export function normalizeProjectPrompts<T>(project:T):T;
