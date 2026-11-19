import { entertainmentHandler } from '../../entertainment-core.js';

export default async function handler(req: Request) {
  return entertainmentHandler(req);
}
export const config = { path: '/gg-entertainment' };
