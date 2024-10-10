/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#import <AuthenticationServices/ASAuthorizationSingleSignOnProvider.h>
#import <AuthenticationServices/AuthenticationServices.h>
#import <Foundation/Foundation.h>

#include <functional>  // For std::function

#include "MicrosoftEntraSSOUtils.h"
#include "nsIURI.h"
#include "nsHttpChannel.h"
#include "nsCocoaUtils.h"
#include "nsTHashMap.h"
#include "nsHashKeys.h"
#include "nsThreadUtils.h"
#include "mozilla/Logging.h"

namespace {
static mozilla::LazyLogModule gMacOSWebAuthnServiceLog("macOSSingleSignOn");
}  // namespace

NS_ASSUME_NONNULL_BEGIN

// Delegate
API_AVAILABLE(macos(13.3))
@interface SSORequestDelegate : NSObject <ASAuthorizationControllerDelegate>
- (void)setCallback:(mozilla::net::MicrosoftEntraSSOUtils*)callback;
@end

namespace mozilla {
namespace net {

class API_AVAILABLE(macos(13.3)) MicrosoftEntraSSOUtils final {
 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(MicrosoftEntraSSOUtils)

  explicit MicrosoftEntraSSOUtils(nsHttpChannel* aChannel,
                                  std::function<void()>&& aResultCallback);
  bool AddMicrosoftEntraSSOInternal();
  void AddRequestHeader(const nsACString& aKey, const nsACString& aValue);
  void InvokeCallback();

 private:
  ~MicrosoftEntraSSOUtils();
  ASAuthorizationSingleSignOnProvider* mProvider;
  ASAuthorizationController* mAuthorizationController;
  SSORequestDelegate* mRequestDelegate;
  RefPtr<nsHttpChannel> mChannel;
  std::function<void()> mResultCallback;
  nsTHashMap<nsCStringHashKey, nsCString> mRequestHeaders;
};
}  // namespace net
}  // namespace mozilla

@implementation SSORequestDelegate {
  RefPtr<mozilla::net::MicrosoftEntraSSOUtils> mCallback;
}
- (void)setCallback:(mozilla::net::MicrosoftEntraSSOUtils*)callback {
  mCallback = callback;
}
- (void)authorizationController:(ASAuthorizationController*)controller
    didCompleteWithAuthorization:(ASAuthorization*)authorization {
  if ([authorization.credential
          isKindOfClass:[ASAuthorizationSingleSignOnCredential class]]) {
    MOZ_LOG(gMacOSWebAuthnServiceLog, mozilla::LogLevel::Debug,
            ("SSORequestDelegate::didCompleteWithAuthorization: "
             "got ASAuthorizationSingleSignOnCredential"));

    ASAuthorizationSingleSignOnCredential* ssoCredential =
        (ASAuthorizationSingleSignOnCredential*)authorization.credential;

    NSHTTPURLResponse* authenticatedResponse =
        ssoCredential.authenticatedResponse;
    if (authenticatedResponse) {
      NSDictionary* headers = authenticatedResponse.allHeaderFields;
      NSMutableString* headersString = [NSMutableString string];
      for (NSString* key in headers) {
        [headersString appendFormat:@"%@: %@\n", key, headers[key]];
      }
      MOZ_LOG(
          gMacOSWebAuthnServiceLog, mozilla::LogLevel::Debug,
          ("SSORequestDelegate::didCompleteWithAuthorization: "
           "authenticatedResponse: \nStatus Code: %ld\nHeaders:\n%s",
           (long)authenticatedResponse.statusCode, [headersString UTF8String]));

      // An example format of ssoCookies:
      // sso_cookies:
      // {"device_headers":[
      // {"header":{"x-ms-DeviceCredential”:”…”},”tenant_id”:”…”}],
      // ”prt_headers":[{"header":{"x-ms-RefreshTokenCredential”:”…”},
      // ”home_account_id”:”….”}]}
      NSString* ssoCookies = headers[@"sso_cookies"];
      if (ssoCookies) {
        NSError* err = nil;
        NSDictionary* ssoCookiesDict = [NSJSONSerialization
            JSONObjectWithData:[ssoCookies
                                   dataUsingEncoding:NSUTF8StringEncoding]
                       options:0
                         error:&err];

        if (!err) {
          NSArray* allHeaders = @[
            ssoCookiesDict[@"device_headers"], ssoCookiesDict[@"prt_headers"]
          ];
          // Append cookie headers retrieved from MS Broker
          for (NSArray* headerArray in allHeaders) {
            for (NSDictionary* headerDict in headerArray) {
              NSDictionary* headers = headerDict[@"header"];
              for (NSString* key in headers) {
                NSString* value = headers[key];
                nsAutoString nsKey;
                nsAutoString nsValue;
                mozilla::CopyNSStringToXPCOMString(key, nsKey);
                mozilla::CopyNSStringToXPCOMString(value, nsValue);
                mCallback->AddRequestHeader(NS_ConvertUTF16toUTF8(nsKey),
                                            NS_ConvertUTF16toUTF8(nsValue));
              }
            }
          }
        } else {
          MOZ_LOG(gMacOSWebAuthnServiceLog, mozilla::LogLevel::Debug,
                  ("SSORequestDelegate::didCompleteWithAuthorization: "
                   "Failed to parse sso_cookies: %s",
                   [[err localizedDescription] UTF8String]));
        }
      } else {
        MOZ_LOG(gMacOSWebAuthnServiceLog, mozilla::LogLevel::Debug,
                ("SSORequestDelegate::didCompleteWithAuthorization: "
                 "sso_cookies is not present"));
      }
    } else {
      MOZ_LOG(gMacOSWebAuthnServiceLog, mozilla::LogLevel::Debug,
              ("SSORequestDelegate::didCompleteWithAuthorization: "
               "authenticatedResponse is nil"));
    }
  } else {
    MOZ_LOG(gMacOSWebAuthnServiceLog, mozilla::LogLevel::Debug,
            ("SSORequestDelegate::didCompleteWithAuthorization: "
             "should have ASAuthorizationSingleSignOnCredential"));
  }

  NS_DispatchToMainThread(NS_NewRunnableFunction(
      "SSORequestDelegate::didCompleteWithAuthorization failure",
      [callback(mCallback)]() {
        MOZ_ASSERT(NS_IsMainThread());
        callback->InvokeCallback();
      }));
}
- (void)authorizationController:(ASAuthorizationController*)controller
           didCompleteWithError:(NSError*)error {
  nsAutoString errorDescription;
  nsAutoString errorDomain;
  nsCocoaUtils::GetStringForNSString(error.localizedDescription,
                                     errorDescription);
  nsCocoaUtils::GetStringForNSString(error.domain, errorDomain);
  MOZ_LOG(gMacOSWebAuthnServiceLog, mozilla::LogLevel::Debug,
          ("SSORequestDelegate::didCompleteWithError: domain "
           "'%s' code %ld (%s)",
           NS_ConvertUTF16toUTF8(errorDomain).get(), error.code,
           NS_ConvertUTF16toUTF8(errorDescription).get()));
  if ([error.domain isEqualToString:ASAuthorizationErrorDomain]) {
    switch (error.code) {
      case ASAuthorizationErrorCanceled:
        MOZ_LOG(gMacOSWebAuthnServiceLog, mozilla::LogLevel::Debug,
                ("SSORequestDelegate::didCompleteWithError: Authorization "
                 "error: The user canceled the authorization attempt."));
        break;
      case ASAuthorizationErrorFailed:
        MOZ_LOG(gMacOSWebAuthnServiceLog, mozilla::LogLevel::Debug,
                ("SSORequestDelegate::didCompleteWithError: Authorization "
                 "error: The authorization attempt failed."));
        break;
      case ASAuthorizationErrorInvalidResponse:
        MOZ_LOG(gMacOSWebAuthnServiceLog, mozilla::LogLevel::Debug,
                ("Authorization error: The authorization request received an "
                 "invalid response."));
        break;
      case ASAuthorizationErrorNotHandled:
        MOZ_LOG(gMacOSWebAuthnServiceLog, mozilla::LogLevel::Debug,
                ("SSORequestDelegate::didCompleteWithError: Authorization "
                 "error: The authorization request wasn’t handled."));
        break;
      case ASAuthorizationErrorUnknown:
        MOZ_LOG(
            gMacOSWebAuthnServiceLog, mozilla::LogLevel::Debug,
            ("SSORequestDelegate::didCompleteWithError: Authorization error: "
             "The authorization attempt failed for an unknown reason."));
        break;
      case ASAuthorizationErrorNotInteractive:
        MOZ_LOG(gMacOSWebAuthnServiceLog, mozilla::LogLevel::Debug,
                ("SSORequestDelegate::didCompleteWithError: Authorization "
                 "error: The authorization request isn’t interactive."));
        break;
      default:
        MOZ_LOG(gMacOSWebAuthnServiceLog, mozilla::LogLevel::Debug,
                ("SSORequestDelegate::didCompleteWithError: Authorization "
                 "error: Unhandled error code."));
        break;
    }
  }

  NS_DispatchToMainThread(NS_NewRunnableFunction(
      "SSORequestDelegate::didCompleteWithError", [callback(mCallback)]() {
        MOZ_ASSERT(NS_IsMainThread());
        callback->InvokeCallback();
      }));
}
@end

namespace mozilla {
namespace net {

MicrosoftEntraSSOUtils::MicrosoftEntraSSOUtils(
    nsHttpChannel* aChannel, std::function<void()>&& aResultCallback)
    : mProvider(nullptr),
      mAuthorizationController(nullptr),
      mRequestDelegate(nullptr),
      mChannel(aChannel),
      mResultCallback(std::move(aResultCallback)) {
  MOZ_LOG(gMacOSWebAuthnServiceLog, mozilla::LogLevel::Debug,
          ("MicrosoftEntraSSOUtils::MicrosoftEntraSSOUtils()"));
}

MicrosoftEntraSSOUtils::~MicrosoftEntraSSOUtils() {
  MOZ_LOG(gMacOSWebAuthnServiceLog, mozilla::LogLevel::Debug,
          ("MicrosoftEntraSSOUtils::~MicrosoftEntraSSOUtils()"));
  if (mRequestDelegate) {
    [mRequestDelegate release];
    mRequestDelegate = nil;
  }
  if (mAuthorizationController) {
    [mAuthorizationController release];
    mAuthorizationController = nil;
  }
}

void MicrosoftEntraSSOUtils::AddRequestHeader(const nsACString& aKey,
                                              const nsACString& aValue) {
  mRequestHeaders.InsertOrUpdate(aKey, aValue);
}

// Used to return to nsHttpChannel::ContinuePrepareToConnect after the delegate
// completes its job
void MicrosoftEntraSSOUtils::InvokeCallback() {
  MOZ_ASSERT(NS_IsMainThread());
  MOZ_ASSERT(mChannel,
             "channel needs to be initialized for MicrosoftEntraSSOUtils");

  if (!mRequestHeaders.IsEmpty()) {
    for (auto iter = mRequestHeaders.Iter(); !iter.Done(); iter.Next()) {
      // Passed value will be merged to any existing value.
      mChannel->SetRequestHeader(iter.Key(), iter.Data(), true);
    }
  }

  std::function<void()> callback = std::move(mResultCallback);
  if (callback) {
    callback();
  }
}

bool MicrosoftEntraSSOUtils::AddMicrosoftEntraSSOInternal() {
  MOZ_LOG(gMacOSWebAuthnServiceLog, mozilla::LogLevel::Debug,
          ("MicrosoftEntraSSOUtils::AddMicrosoftEntraSSO start"));
  MOZ_ASSERT(NS_IsMainThread());
  MOZ_ASSERT(mChannel,
             "channel needs to be initialized for MicrosoftEntraSSOUtils");

  NSURL* url =
      [NSURL URLWithString:@"https://login.microsoftonline.com/common"];

  mProvider = [ASAuthorizationSingleSignOnProvider
      authorizationProviderWithIdentityProviderURL:url];
  if (!mProvider) {
    return false;
  }

  if (![mProvider canPerformAuthorization]) {
    return false;
  }

  nsCOMPtr<nsIURI> uri;
  mChannel->GetURI(getter_AddRefs(uri));
  if (!url) {
    return false;
  }

  nsAutoCString urispec;
  uri->GetSpec(urispec);
  NSString* urispecNSString = [NSString stringWithUTF8String:urispec.get()];
  MOZ_LOG(gMacOSWebAuthnServiceLog, mozilla::LogLevel::Debug,
          ("MicrosoftEntraSSOUtils::AddMicrosoftEntraSSO [urispec=%s]",
           urispec.get()));

  // Create a controller and initialize it with SSO requests
  ASAuthorizationSingleSignOnRequest* ssoRequest = [mProvider createRequest];
  ssoRequest.requestedOperation = @"get_sso_cookies";
  ssoRequest.userInterfaceEnabled = NO;

  // Set NSURLQueryItems for the MS broker
  NSURLQueryItem* ssoUrl = [NSURLQueryItem queryItemWithName:@"sso_url"
                                                       value:urispecNSString];
  NSURLQueryItem* typesOfHeader =
      [NSURLQueryItem queryItemWithName:@"types_of_header" value:@"0"];
  NSURLQueryItem* brokerKey = [NSURLQueryItem
      queryItemWithName:@"broker_key"
                  value:@"kSiiehqi0sbYWxT2zOmV-rv8B3QRNsUKcU3YPc122121"];
  NSURLQueryItem* protocolVer =
      [NSURLQueryItem queryItemWithName:@"msg_protocol_ver" value:@"4"];
  ssoRequest.authorizationOptions =
      @[ ssoUrl, typesOfHeader, brokerKey, protocolVer ];

  if (!ssoRequest) {
    return false;
  }

  mAuthorizationController = [[ASAuthorizationController alloc]
      initWithAuthorizationRequests:@[ ssoRequest ]];
  if (!mAuthorizationController) {
    return false;
  }

  mRequestDelegate = [[SSORequestDelegate alloc] init];
  [mRequestDelegate setCallback:this];
  mAuthorizationController.delegate = mRequestDelegate;

  [mAuthorizationController performRequests];

  // Return true after acknowledging that the delegate will be called
  return true;
}

API_AVAILABLE(macos(13.3))
nsresult AddMicrosoftEntraSSO(nsHttpChannel* aChannel,
                              std::function<void()>&& aResultCallback) {
  MOZ_ASSERT(XRE_IsParentProcess());

  // The service is used by this function and the delegate, and it should be
  // released when the delegate finishes running. It will remain alive even
  // after AddMicrosoftEntraSSO returns.
  RefPtr<MicrosoftEntraSSOUtils> service =
      new MicrosoftEntraSSOUtils(aChannel, std::move(aResultCallback));
  return service->AddMicrosoftEntraSSOInternal() ? NS_OK : NS_ERROR_FAILURE;
}
}  // namespace net
}  // namespace mozilla

NS_ASSUME_NONNULL_END
