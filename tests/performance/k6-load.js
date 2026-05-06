import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 20,
  duration: '2m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

const baseUrl = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const res = http.get(`${baseUrl}/health`);
  check(res, {
    'health status is 200': (r) => r.status === 200,
  });
  sleep(1);
}
