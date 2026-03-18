import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-otlp-http';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

export interface OTelConfig {
  serviceName: string;
  serviceVersion?: string;
  endpoint?: string;
  headers?: Record<string, string>;
  backend: 'jaeger' | 'otlp' | 'datadog' | 'honeycomb' | 'grafana';
  samplingRatio?: number;
}

/**
 * Configure OpenTelemetry for AgentFlow
 */
export class AgentFlowOTelConfig {
  private sdk?: NodeSDK;

  /**
   * Initialize OpenTelemetry with the specified configuration
   */
  async initialize(config: OTelConfig): Promise<void> {
    const resource = new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: config.serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: config.serviceVersion || '1.0.0',
      [SemanticResourceAttributes.SERVICE_NAMESPACE]: 'agentflow',
    });

    const traceExporter = this.createExporter(config);

    this.sdk = new NodeSDK({
      resource,
      traceExporter,
      samplingRatio: config.samplingRatio || 1.0,
    });

    await this.sdk.start();
    console.log(`🔭 AgentFlow OTel initialized for ${config.backend}`);
  }

  /**
   * Shutdown OpenTelemetry gracefully
   */
  async shutdown(): Promise<void> {
    if (this.sdk) {
      await this.sdk.shutdown();
    }
  }

  private createExporter(config: OTelConfig) {
    switch (config.backend) {
      case 'jaeger':
        return new JaegerExporter({
          endpoint: config.endpoint || 'http://localhost:14268/api/traces',
        });

      case 'otlp':
        return new OTLPTraceExporter({
          url: config.endpoint || 'http://localhost:4318/v1/traces',
          headers: config.headers || {},
        });

      case 'datadog':
        return new OTLPTraceExporter({
          url: config.endpoint || 'https://trace.agent.datadoghq.com/v1/traces',
          headers: {
            'DD-API-KEY': config.headers?.['DD-API-KEY'] || process.env.DD_API_KEY || '',
            ...config.headers,
          },
        });

      case 'honeycomb':
        return new OTLPTraceExporter({
          url: config.endpoint || 'https://api.honeycomb.io/v1/traces',
          headers: {
            'x-honeycomb-team': config.headers?.['x-honeycomb-team'] || process.env.HONEYCOMB_API_KEY || '',
            'x-honeycomb-dataset': config.headers?.['x-honeycomb-dataset'] || 'agentflow',
            ...config.headers,
          },
        });

      case 'grafana':
        return new OTLPTraceExporter({
          url: config.endpoint || 'https://tempo.grafana.net:443/tempo/api/push',
          headers: {
            Authorization: `Basic ${Buffer.from(
              `${config.headers?.username || process.env.GRAFANA_TEMPO_USERNAME}:${
                config.headers?.password || process.env.GRAFANA_TEMPO_PASSWORD
              }`
            ).toString('base64')}`,
            ...config.headers,
          },
        });

      default:
        throw new Error(`Unsupported OTel backend: ${config.backend}`);
    }
  }
}

/**
 * Preset configurations for common OTel backends
 */
export const OTelPresets = {
  /**
   * Local Jaeger instance (useful for development)
   */
  jaeger(): OTelConfig {
    return {
      serviceName: 'agentflow',
      backend: 'jaeger',
      endpoint: 'http://localhost:14268/api/traces',
    };
  },

  /**
   * Datadog APM configuration
   */
  datadog(apiKey?: string): OTelConfig {
    return {
      serviceName: 'agentflow',
      backend: 'datadog',
      headers: {
        'DD-API-KEY': apiKey || process.env.DD_API_KEY || '',
      },
    };
  },

  /**
   * Honeycomb configuration
   */
  honeycomb(apiKey?: string, dataset?: string): OTelConfig {
    return {
      serviceName: 'agentflow',
      backend: 'honeycomb',
      headers: {
        'x-honeycomb-team': apiKey || process.env.HONEYCOMB_API_KEY || '',
        'x-honeycomb-dataset': dataset || 'agentflow',
      },
    };
  },

  /**
   * Grafana Tempo configuration
   */
  grafana(username?: string, password?: string): OTelConfig {
    return {
      serviceName: 'agentflow',
      backend: 'grafana',
      headers: {
        username: username || process.env.GRAFANA_TEMPO_USERNAME || '',
        password: password || process.env.GRAFANA_TEMPO_PASSWORD || '',
      },
    };
  },

  /**
   * Generic OTLP endpoint
   */
  otlp(endpoint: string, headers?: Record<string, string>): OTelConfig {
    return {
      serviceName: 'agentflow',
      backend: 'otlp',
      endpoint,
      headers,
    };
  },
};