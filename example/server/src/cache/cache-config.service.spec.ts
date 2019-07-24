import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '../config/config.service';
import { CacheConfigService } from './cache-config.service';

import 'jest';

const MockConfigService = jest.fn().mockImplementation(() => {
  return {
    get: (key: string) => null,
  };
});

describe('CacheConfigService', () => {
  let service: CacheConfigService;
  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CacheConfigService, { useClass: MockConfigService, provide: ConfigService }],
    }).compile();
    service = module.get<CacheConfigService>(CacheConfigService);
  });
  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
