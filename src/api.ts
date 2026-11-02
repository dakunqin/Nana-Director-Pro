let token = "";
export async function api<T = unknown>(
  route: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await fetch("/api/v1" + route, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "请求失败");
  return data;
}
export async function connect() {
  const session = await api<{ token: string }>("/session");
  token = session.token;
}
export const fileUrl = (path: string, download = false) =>
  "/api/v1/file?path=" +
  encodeURIComponent(path) +
  (download ? "&download=1" : "");
export const bytes = (n = 0) =>
  n >= 1e9
    ? (n / 1e9).toFixed(1) + " GB"
    : n >= 1e6
      ? (n / 1e6).toFixed(1) + " MB"
      : (n / 1e3).toFixed(0) + " KB";

export async function uploadModel(file:File,folder:string,onProgress:(value:number)=>void){return new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('POST','/api/v1/models/import?folder='+encodeURIComponent(folder)+'&filename='+encodeURIComponent(file.name)+'&size='+file.size);xhr.setRequestHeader('Authorization','Bearer '+token);xhr.setRequestHeader('Content-Type','application/octet-stream');xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(e.loaded/e.total*100);};xhr.onerror=()=>reject(new Error('模型导入连接中断，请重试'));xhr.onload=()=>{try{const value=JSON.parse(xhr.responseText);if(xhr.status>=200&&xhr.status<300)resolve(value);else reject(new Error(value.error||'模型导入失败'));}catch{reject(new Error('模型导入响应无效'));}};xhr.send(file);});}
