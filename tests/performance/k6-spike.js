import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '30s', target: 500 },
    { duration: '1m', target: 500 },
    { duration: '30s', target: 20 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.10'],
    http_req_duration: ['p(95)<2000'],
  },
};

const baseUrl = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const res = http.get(`${baseUrl}/health`);
  check(res, {
    'spike health status is 200': (r) => r.status === 200,
  });
  sleep(0.1);
}