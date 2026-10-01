import UIKit
import Capacitor
import AVFoundation

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = ChefBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

/// Eigene Bridge, damit die App-eigenen Module (Lampe) angemeldet werden.
class ChefBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(LampePlugin())
    }
}

/// Taschenlampe fürs dunkle Kühlhaus. Im WebView kennt iOS kein „torch“ an
/// der Kamera-Spur – der Knopf erschien auf dem iPhone deshalb nie.
/// Hier nativ über AVCaptureDevice. NICHT auf einem echten iPhone getestet
/// (der Simulator hat keine Lampe): ob iOS das Licht anlässt, während die
/// Web-Kamera läuft, zeigt erst das Gerät. Klappt es nicht, meldet setzen()
/// einen Fehler und der Knopf bleibt aus – nichts tut nur so.
@objc(LampePlugin)
public class LampePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LampePlugin"
    public let jsName = "Lampe"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "verfuegbar", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setzen", returnType: CAPPluginReturnPromise),
    ]

    private var geraet: AVCaptureDevice? { AVCaptureDevice.default(for: .video) }

    @objc func verfuegbar(_ call: CAPPluginCall) {
        let g = geraet
        call.resolve(["verfuegbar": g?.hasTorch == true && g?.isTorchAvailable == true])
    }

    @objc func setzen(_ call: CAPPluginCall) {
        let an = call.getBool("an") ?? false
        guard let g = geraet, g.hasTorch else { call.reject("keine_lampe"); return }
        do {
            try g.lockForConfiguration()
            defer { g.unlockForConfiguration() }
            if an {
                try g.setTorchModeOn(level: AVCaptureDevice.maxAvailableTorchLevel)
            } else {
                g.torchMode = .off
            }
            call.resolve(["an": g.torchMode == .on])
        } catch {
            call.reject("lampe_fehler", nil, error)
        }
    }
}
