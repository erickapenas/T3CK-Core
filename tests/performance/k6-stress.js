import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '2m', target: 150 },
    { duration: '2m', target: 300 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<1200'],
  },
};

const baseUrl = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const res = http.get(`${baseUrl}/health`);
  check(res, {
    'stress health status is 200': (r) => r.status === 200,
  });
  sleep(0.2);
}
