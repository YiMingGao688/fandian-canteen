import http from 'node:http'

const HOST = '127.0.0.1'
const PORT = Number(process.env.CAMPUS_NOTIFY_PROXY_PORT || 18089)
const UPSTREAM_HOST = '127.0.0.1'
const UPSTREAM_PORT = Number(process.env.CAMPUS_BACKEND_PORT || 18088)
const CALLBACK_PATH = '/notify/alipay'

// 只把支付宝异步回调转发给本机后端，不提供其他业务 API 的公网入口。
const server = http.createServer((request, response) => {
  if (request.method !== 'POST' || request.url !== CALLBACK_PATH) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Not found')
    return
  }

  const upstream = http.request({
    hostname: UPSTREAM_HOST,
    port: UPSTREAM_PORT,
    path: CALLBACK_PATH,
    method: 'POST',
    headers: { ...request.headers, host: `${UPSTREAM_HOST}:${UPSTREAM_PORT}` },
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers)
    upstreamResponse.pipe(response)
  })

  upstream.on('error', () => {
    if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Callback service unavailable')
  })
  request.on('error', () => upstream.destroy())
  request.pipe(upstream)
})

server.listen(PORT, HOST, () => {
  console.log(`Alipay callback proxy listening on http://${HOST}:${PORT}${CALLBACK_PATH}`)
})
