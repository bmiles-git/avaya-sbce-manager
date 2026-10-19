import { findingsFor, TEAMS_CIPHERS, USE_LABEL } from "@/lib/cert-requirements";
import { useApp } from "@/lib/store";
import type { CertRequirements, CertUse, KeyAlgorithm, PeerCheck } from "@/lib/types";
import { Field, inputClass, Panel } from "@/components/ui";

export function CertDetail({ certId }: { certId: string }) {
  const cert = useApp((s) => s.certs.find((item) => item.id === certId));
  const device = useApp((s) => s.devices.find((item) => item.id === cert?.deviceId));
  const update = useApp((s) => s.updateCert);
  const admin = useApp((s) => s.session?.role === "admin");
  if (!cert) return null;
  if (!cert.requirements) {
    return <Panel title={cert.name}>This certificate has no requirement record yet. Reset the demo to reload it.</Panel>;
  }
  const req = cert.requirements;
  const findings = findingsFor(cert);
  const patch = (requirements: Partial<CertRequirements>) => update(cert.id, { requirements });

  return (
    <div className="space-y-4">
      <Panel title={`${device?.name ?? "Device"} · ${cert.name}`}>
        <div className="space-y-3">
          <Field label="Use">
            <select
              className={inputClass}
              disabled={!admin}
              value={req.use}
              onChange={(e) => patch({ use: e.target.value as CertUse })}
            >
              {Object.entries(USE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Subject">
            <input
              className={inputClass}
              disabled={!admin}
              value={cert.subject}
              onChange={(e) => update(cert.id, { subject: e.target.value })}
            />
          </Field>
          <Field label="SANs (comma separated)">
            <input
              className={inputClass}
              disabled={!admin}
              value={cert.sans.join(", ")}
              onChange={(e) =>
                update(cert.id, {
                  sans: e.target.value.split(",").map((item) => item.trim()).filter(Boolean),
                })
              }
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Key">
              <select
                className={inputClass}
                disabled={!admin}
                value={req.keyAlgorithm}
                onChange={(e) => patch({ keyAlgorithm: e.target.value as KeyAlgorithm })}
              >
                <option>ECDSA-P256</option>
                <option>ECDSA-P384</option>
                <option>RSA-2048</option>
                <option>RSA-4096</option>
              </select>
            </Field>
            <Field label="TLS">
              <select
                className={inputClass}
                disabled={!admin}
                value={req.tlsVersion}
                onChange={(e) => patch({ tlsVersion: e.target.value as "1.2" | "1.3" })}
              >
                <option value="1.2">1.2</option>
                <option value="1.3">1.3</option>
              </select>
            </Field>
          </div>
          <Field label="Issuer">
            <input className={inputClass} disabled={!admin} value={req.issuer} onChange={(e) => patch({ issuer: e.target.value })} />
          </Field>
          <Field label="Public FQDN">
            <input className={inputClass} disabled={!admin} value={req.fqdn} onChange={(e) => patch({ fqdn: e.target.value })} />
          </Field>
          <Field label="SIP domain">
            <input className={inputClass} disabled={!admin} value={req.sipDomain} onChange={(e) => patch({ sipDomain: e.target.value })} />
          </Field>
          <Field label="Custom hostnames">
            <input
              className={inputClass}
              disabled={!admin}
              value={req.customHostnames}
              onChange={(e) => patch({ customHostnames: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Server peer check">
              <select
                className={inputClass}
                disabled={!admin}
                value={req.serverPeerVerification}
                onChange={(e) => patch({ serverPeerVerification: e.target.value as PeerCheck })}
              >
                <option value="none">none</option>
                <option value="required">required</option>
              </select>
            </Field>
            <Field label="Client peer check">
              <select
                className={inputClass}
                disabled={!admin}
                value={req.clientPeerVerification}
                onChange={(e) => patch({ clientPeerVerification: e.target.value as PeerCheck })}
              >
                <option value="none">none</option>
                <option value="required">required</option>
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" disabled={!admin} checked={req.publicTrusted} onChange={(e) => patch({ publicTrusted: e.target.checked })} />
            Public CA
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" disabled={!admin} checked={req.avayaDemo} onChange={(e) => patch({ avayaDemo: e.target.checked })} />
            Avaya demo certificate
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" disabled={!admin} checked={req.peerCaImported} onChange={(e) => patch({ peerCaImported: e.target.checked })} />
            Peer CA imported on the client profile
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={!admin}
              checked={req.extendedHostnameValidation}
              onChange={(e) => patch({ extendedHostnameValidation: e.target.checked })}
            />
            Extended hostname validation
          </label>
          {req.use === "teams-direct-routing" ? (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" disabled={!admin} checked={req.m365Domain} onChange={(e) => patch({ m365Domain: e.target.checked })} />
                FQDN domain is registered in Microsoft 365
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" disabled={!admin} checked={req.srtp} onChange={(e) => patch({ srtp: e.target.checked })} />
                SRTP
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" disabled={!admin} checked={req.srtcp} onChange={(e) => patch({ srtcp: e.target.checked })} />
                SRTCP
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" disabled={!admin} checked={req.mki} onChange={(e) => patch({ mki: e.target.checked })} />
                Master key identifier
              </label>
              <fieldset className="space-y-1">
                <legend className="text-xs text-muted">Teams ciphers</legend>
                {TEAMS_CIPHERS.map((cipher) => (
                  <label key={cipher} className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      disabled={!admin}
                      checked={req.ciphers.includes(cipher)}
                      onChange={(e) =>
                        patch({
                          ciphers: e.target.checked ? [...req.ciphers, cipher] : req.ciphers.filter((item) => item !== cipher),
                        })
                      }
                    />
                    <span className="font-mono">{cipher}</span>
                  </label>
                ))}
              </fieldset>
            </div>
          ) : null}
          {req.use === "remote-worker" ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" disabled={!admin} checked={req.srtp} onChange={(e) => patch({ srtp: e.target.checked })} />
              SRTP toward remote workers
            </label>
          ) : null}
          <p className="text-xs text-muted">TLS profiles: {cert.tlsProfiles.join(", ") || "none"}</p>
        </div>
      </Panel>
      <Panel title="Against the Avaya notes">
        <ul className="space-y-2">
          {findings.map((item) => (
            <li key={item.text} className={item.ok ? "text-sm text-ok" : "text-sm text-danger"}>
              {item.ok ? "Meets" : "Change"} · {item.text}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
