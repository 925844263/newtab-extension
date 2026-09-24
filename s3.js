/* S3 兼容对象存储客户端（MinIO / AWS S3 等），实现 AWS Signature V4 签名。
   纯标准 Web Crypto 实现，无第三方依赖。暴露 window.s3 = { putObject, getObject, headObject } */

(function () {
  const encoder = new TextEncoder();

  async function sha256Hex(data) {
    const buf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function hmacRaw(keyBytes, dataBytes) {
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, dataBytes);
    return new Uint8Array(sig);
  }

  async function hmacHex(keyBytes, dataBytes) {
    const sig = await hmacRaw(keyBytes, dataBytes);
    return Array.from(sig).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function signV4(method, url, accessKey, secretKey, region, bodyBytes) {
    const u = new URL(url);
    const host = u.host;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = await sha256Hex(bodyBytes || new Uint8Array(0));

    const headers = {
      "host": host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate
    };
    const keys = Object.keys(headers).sort();
    const canonicalHeaders = keys.map((k) => k.toLowerCase() + ":" + headers[k].trim() + "\n").join("");
    const signedHeaders = keys.map((k) => k.toLowerCase()).join(";");

    const canonicalUri = u.pathname || "/";
    const canonicalQuery = u.search ? u.search.slice(1) : "";
    const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join("\n");

    const scope = dateStamp + "/" + region + "/s3/aws4_request";
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(encoder.encode(canonicalRequest))].join("\n");

    const kDate = await hmacRaw(encoder.encode("AWS4" + secretKey), encoder.encode(dateStamp));
    const kRegion = await hmacRaw(kDate, encoder.encode(region));
    const kService = await hmacRaw(kRegion, encoder.encode("s3"));
    const kSigning = await hmacRaw(kService, encoder.encode("aws4_request"));
    const signature = await hmacHex(kSigning, encoder.encode(stringToSign));

    const authorization = "AWS4-HMAC-SHA256 Credential=" + accessKey + "/" + scope +
      ", SignedHeaders=" + signedHeaders + ", Signature=" + signature;
    return { authorization, amzDate, payloadHash };
  }

  async function s3Request(method, cfg, key, bodyStr) {
    const endpoint = (cfg.endpoint || "").trim().replace(/\/+$/, "");
    const bucket = (cfg.bucket || "").trim().replace(/^\/+|\/+$/g, "");
    const region = cfg.region || "us-east-1";
    const url = endpoint + "/" + bucket + "/" + encodeURIComponent(key);
    const bodyBytes = bodyStr !== undefined ? encoder.encode(bodyStr) : undefined;
    const sign = await signV4(method, url, cfg.accessKey, cfg.secretKey, region, bodyBytes);

    const opts = {
      method,
      headers: {
        "Authorization": sign.authorization,
        "x-amz-date": sign.amzDate,
        "x-amz-content-sha256": sign.payloadHash
      }
    };
    if (bodyBytes !== undefined) {
      opts.body = bodyBytes;
      opts.headers["Content-Type"] = "application/json";
    }
    return fetch(url, opts);
  }

  window.s3 = {
    putObject: (cfg, key, bodyStr) => s3Request("PUT", cfg, key, bodyStr),
    getObject: (cfg, key) => s3Request("GET", cfg, key),
    headObject: (cfg, key) => s3Request("HEAD", cfg, key)
  };
})();
