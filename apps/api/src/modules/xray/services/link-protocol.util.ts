import { LinkProtocol } from '@prisma/client';

export const detectLinkProtocol = (url: string): LinkProtocol => {
  const scheme = url.split('://')[0]?.toLowerCase() ?? '';
  const map: Record<string, LinkProtocol> = {
    vless: LinkProtocol.VLESS,
    vmess: LinkProtocol.VMESS,
    trojan: LinkProtocol.TROJAN,
    ss: LinkProtocol.SHADOWSOCKS,
    shadowsocks: LinkProtocol.SHADOWSOCKS,
    hysteria: LinkProtocol.HYSTERIA,
    hysteria2: LinkProtocol.HYSTERIA2,
  };
  return map[scheme] ?? LinkProtocol.OTHER;
};
