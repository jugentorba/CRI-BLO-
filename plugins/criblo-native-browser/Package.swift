// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "CribloNativeBrowser",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CribloNativeBrowser",
            targets: ["CRIBrowserPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "CRIBrowserPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/CRIBrowserPlugin")
    ]
)
