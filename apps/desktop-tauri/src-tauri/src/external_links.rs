//! Restricted external links requested by the embedded Marketplace Client.

use url::Url;

fn valid_segment(value: &str) -> bool {
    !value.is_empty()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
}

fn valid_npm_package_path(segments: &[&str]) -> bool {
    match segments {
        ["package", name] => valid_segment(name),
        ["package", scope, name] => {
            scope.starts_with('@') && valid_segment(&scope[1..]) && valid_segment(name)
        }
        _ => false,
    }
}

fn validate_marketplace_url(value: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|_| "marketplace link is not a valid URL".to_string())?;
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || url.fragment().is_some()
    {
        return Err("marketplace links require an ordinary HTTPS URL".into());
    }

    let segments = url
        .path_segments()
        .ok_or_else(|| "marketplace link has no path".to_string())?
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>();
    match url.host_str() {
        Some("github.com")
            if url.query().is_none()
                && segments.len() == 2
                && segments.iter().all(|segment| valid_segment(segment)) =>
        {
            Ok(url)
        }
        Some("www.npmjs.com") if segments.as_slice() == ["search"] => {
            let pairs = url.query_pairs().collect::<Vec<_>>();
            if pairs.len() == 1 && pairs[0].0 == "q" && !pairs[0].1.is_empty() {
                Ok(url)
            } else {
                Err("npm search links require one non-empty q parameter".into())
            }
        }
        Some("www.npmjs.com")
            if url.query().is_none() && valid_npm_package_path(segments.as_slice()) =>
        {
            Ok(url)
        }
        _ => {
            Err("marketplace links may open only a GitHub repository or npm package search".into())
        }
    }
}

/// Open one Marketplace repository or npm URL in the system browser.
#[tauri::command]
pub fn open_marketplace_url(url: String) -> Result<(), String> {
    let url = validate_marketplace_url(&url)?;
    tauri_plugin_opener::open_url(url.as_str(), None::<&str>).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::validate_marketplace_url;

    #[test]
    fn marketplace_links_accept_only_repository_and_npm_destinations() {
        for url in [
            "https://github.com/volcengine/OpenViking",
            "https://www.npmjs.com/search?q=OpenViking",
            "https://www.npmjs.com/package/dsh-plugin-marketplace",
            "https://www.npmjs.com/package/@openviking/dsh-memory-plugin",
        ] {
            assert_eq!(validate_marketplace_url(url).unwrap().as_str(), url);
        }
    }

    #[test]
    fn marketplace_links_reject_privileged_or_unrelated_urls() {
        for url in [
            "http://github.com/volcengine/OpenViking",
            "https://user@github.com/volcengine/OpenViking",
            "https://github.com:444/volcengine/OpenViking",
            "https://github.com/volcengine/OpenViking/issues",
            "https://github.com.evil.example/volcengine/OpenViking",
            "https://www.npmjs.com/settings/profile",
            "https://www.npmjs.com/search?q=OpenViking&redirect=true",
        ] {
            assert!(validate_marketplace_url(url).is_err(), "accepted {url}");
        }
    }
}
