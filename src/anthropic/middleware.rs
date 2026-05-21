//! Anthropic API 中间件

use std::sync::Arc;

use axum::{
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Json, Response},
};
use parking_lot::RwLock;

use crate::common::auth;
use crate::kiro::provider::KiroProvider;

use super::types::ErrorResponse;

/// 应用共享状态
#[derive(Clone)]
pub struct AppState {
    /// API 密钥（运行时可修改，与 Admin 持久化共享）
    pub api_key: Arc<RwLock<String>>,
    /// Kiro Provider（可选，用于实际 API 调用）
    /// 内部使用 MultiTokenManager，已支持线程安全的多凭据管理
    pub kiro_provider: Option<Arc<KiroProvider>>,
    /// 是否开启非流式响应的 thinking 块提取
    pub extract_thinking: bool,
}

impl AppState {
    /// 创建新的应用状态
    ///
    /// 默认入口通过 `with_provider` 注入 `KiroProvider`；这个简化构造函数留给
    /// 下游 lib 用户使用（e.g. 测试、嵌入到其他服务时）。
    #[allow(dead_code)]
    pub fn new(api_key: impl Into<String>, extract_thinking: bool) -> Self {
        Self {
            api_key: Arc::new(RwLock::new(api_key.into())),
            kiro_provider: None,
            extract_thinking,
        }
    }

    /// 使用现有 Arc 共享 api_key（用于与 Admin 模块共享同一份内存）
    pub fn with_shared_api_key(api_key: Arc<RwLock<String>>, extract_thinking: bool) -> Self {
        Self {
            api_key,
            kiro_provider: None,
            extract_thinking,
        }
    }

    /// 设置 KiroProvider
    pub fn with_kiro_provider(mut self, provider: KiroProvider) -> Self {
        self.kiro_provider = Some(Arc::new(provider));
        self
    }
}

/// API Key 认证中间件
pub async fn auth_middleware(
    State(state): State<AppState>,
    request: Request<Body>,
    next: Next,
) -> Response {
    let current = state.api_key.read().clone();
    match auth::extract_api_key(&request) {
        Some(key) if auth::constant_time_eq(&key, &current) => next.run(request).await,
        _ => {
            let error = ErrorResponse::authentication_error();
            (StatusCode::UNAUTHORIZED, Json(error)).into_response()
        }
    }
}

/// CORS 中间件层
///
/// **安全说明**：当前配置允许所有来源（Any），这是为了支持公开 API 服务。
/// 如果需要更严格的安全控制，请根据实际需求配置具体的允许来源、方法和头信息。
///
/// # 配置说明
/// - `allow_origin(Any)`: 允许任何来源的请求
/// - `allow_methods(Any)`: 允许任何 HTTP 方法
/// - `allow_headers(Any)`: 允许任何请求头
pub fn cors_layer() -> tower_http::cors::CorsLayer {
    use tower_http::cors::{Any, CorsLayer};

    CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any)
}
