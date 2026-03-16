/**
 * 🌾 QQ农场抓号脚本 (Loon)
 * 农场 UI 风格
 */

const _arg = (typeof $argument !== "undefined" && $argument) || {}

const TARGET = _arg.TARGET || ""
const LOGIN_KEY_HEADER = _arg.LOGIN_KEY_HEADER || "X-Remote-Login-Key"
const LOGIN_KEY = _arg.LOGIN_KEY || ""
const BARK = _arg.BARK || ""

const DEBOUNCE = parseInt(_arg.DEBOUNCE, 10) || 5000
const NOTIFY = String(_arg.NOTIFY) === "true"

const STORE_KEY = "qq_farm_last_capture_time"


// ================= 平台图标 =================
function platformIcon(p) {
  if (p === "qq") return "🐧"
  if (p === "wx") return "💬"
  return "📱"
}


// ================= 农场通知 =================
function notify(title, content) {

  if (!NOTIFY) return

  const head = "🌾 农场仓库"

  const body =
    "━━━━━━━━━━\n" +
    "👨‍🌾 农夫情报\n" +
    content + "\n" +
    "━━━━━━━━━━"

  $notification.post(head, title, body, {
    "open-url": "loon://switch"
  })
}


// ================= HTTP POST =================
function httpPost(opts) {
  return new Promise(function (resolve) {
    $httpClient.post(opts, function (err, resp, data) {
      resolve({ err: err, resp: resp, data: data })
    })
  })
}


// 模拟真实设备无响应 - 返回空响应，避免触发风控检测
const DONE_RESP = {
  response: {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-cache",
      "Server": "nginx"
    },
    body: ""
  }
}


  // ================= 主逻辑 =================
  ; (async function () {

    const url = $request.url

    if (!url) {
      $done({})
      return
    }

    const now = Date.now()
    const last = Number($persistentStore.read(STORE_KEY) || 0)

    // 防抖
    if (now - last < DEBOUNCE) {
      console.log("⏳ 农场防抖触发")
      $done(DONE_RESP)
      return
    }

    $persistentStore.write(String(now), STORE_KEY)

    const searchParams = new URL(url).searchParams

    const platform = searchParams.get("platform") || "unknown"
    const code = searchParams.get("code") || "unknown"

    const icon = platformIcon(platform)

    console.log("🌾 农场捕获")
    console.log("平台:", platform)
    console.log("code:", code)

    try {

      const tasks = []

      // ================= 服务器入库 =================
      if (TARGET) {

        tasks.push(
          httpPost({
            url: TARGET,
            timeout: 10000,
            headers: {
              "Content-Type": "application/json",
              [LOGIN_KEY_HEADER]: LOGIN_KEY
            },
            body: JSON.stringify({
              url: url,
              code: code,
              platform: platform
            })
          }).then(function (res) {

            if (res.err) {

              console.log("❌ 服务器推送失败")

              notify(
                "💥 入库失败",
                "📡 服务器连接失败"
              )

            } else {

              console.log("🚜 服务器入库成功")

              notify(
                "🚜 新农夫加入",
                icon + " 平台：" + platform + "\n" +
                "🪪 身份码：" + code + "\n\n" +
                "📦 已加入农场仓库"
              )

            }

          })
        )

      }

      // ================= Bark 推送 =================
      if (BARK) {

        const title = "🌾 农场仓库更新"

        const bodyText =
          "👨‍🌾 新农夫情报\n\n" +
          icon + " 平台：" + platform + "\n" +
          "🪪 身份码：" + code + "\n\n" +
          "📡 捕获链接\n" +
          url + "\n\n" +
          "🚜 已存入农场仓库"

        tasks.push(
          httpPost({
            url: BARK,
            timeout: 10000,
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              title: title,
              body: bodyText,
              group: "qq-farm",
              sound: "bell",
              level: "timeSensitive",
              copy: url
            })
          }).then(function (res) {

            if (res.err) {

              console.log("❌ Bark 推送失败")

              notify(
                "🔔 Bark推送失败",
                "服务器返回异常"
              )

            }

          })
        )

      }

      await Promise.all(tasks)

    } catch (e) {

      console.log("❌ 脚本异常:", e)

      notify(
        "💥 农场系统异常",
        String(e)
      )

    }

    $done(DONE_RESP)

  })()