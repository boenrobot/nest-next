import {
  ArgumentsHost,
  Catch,
} from '@nestjs/common';
import { RequestHandler } from '@nestjs/common/interfaces';
import { BaseExceptionFilter } from '@nestjs/core';
import { IncomingMessage, ServerResponse } from 'http';
import { parse as parseUrl } from 'url';
import { isInternalUrl } from './next-utils';
import { RenderService } from './render.service';
import { ErrorRenderer, ErrorResponse } from './types';

@Catch()
export class RenderFilter extends BaseExceptionFilter {
  private readonly service: RenderService;
  private readonly requestHandler: RequestHandler;
  private errorRenderer: ErrorRenderer;

  constructor(service: RenderService) {
    super(service.getHttpServer());
    this.service = service;

    const requestHandler = this.service.getRequestHandler();
    const errorRenderer = this.service.getErrorRenderer();
    // these really should already always be set since it is done during the module registration
    // if somehow they aren't throw an error
    if (!requestHandler || !errorRenderer) {
      throw new Error(
        'Request and/or error renderer not set on RenderService',
      );
    }
    this.requestHandler = requestHandler;
    this.errorRenderer = errorRenderer;
  }

  /**
   * Nest isn't aware of how next handles routing for the build assets, let next
   * handle routing for any request that isn't handled by a controller
   * @param err
   * @param host
   */
  public async catch(err: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest();
    const response = ctx.getResponse();

    if (response && request) {
      const res: ServerResponse = response.res ? response.res : response;
      const req: IncomingMessage = request.raw ? request.raw : request;

      if (!res.headersSent && req.url) {
        // check to see if the URL requested is an internal nextjs route
        // if internal, the url is to some asset (ex /_next/*) that needs to be rendered by nextjs
        if (isInternalUrl(req.url)) {
          return this.requestHandler(req, res);
        }

        // let next handle the error
        // it's possible that the err doesn't contain a status code, if this is the case treat
        // it as an internal server error
        res.statusCode = err && err.status ? err.status : 500;

        const { pathname, query } = parseUrl(req.url, true);

        // if the path does not match the one configured to use error rendering,
        // render with the default exception filter.
        const errorHandlerFilter = this.service.getUseErrorHandler();
        if (
          errorHandlerFilter === false ||
          (typeof pathname === 'string' &&
            (errorHandlerFilter instanceof RegExp &&
              !errorHandlerFilter.test(pathname)))
        ) {
          return super.catch(err, host);
        }

        const errorHandler = this.service.getErrorHandler();

        if (errorHandler) {
          await errorHandler(err, request, response, pathname, query);
        }

        if (response.sent === true || res.headersSent) {
          return;
        }

        const serializedErr = this.serializeError(err);

        return this.errorRenderer(serializedErr, req, res, pathname, query);
      }
    }

    // if the request and/or response are undefined (as with GraphQL),
    // or if the headers are already sent, fallback to the default filter
    return super.catch(err, host);
  }

  /**
   * Serialize the error similarly to method used in Next -- parse error as Nest error type
   * @param err
   */
  public serializeError(err: any): ErrorResponse {
    const out: ErrorResponse = {};

    if (!err) {
      return out;
    }

    if (err.stack && this.service.isDev()) {
      out.stack = err.stack;
    }

    if (err.response && typeof err.response === 'object') {
      const { statusCode, error, message } = err.response;
      out.statusCode = statusCode;
      out.name = error;
      out.message = message;
    } else if (err.message && typeof err.message === 'object') {
      const { statusCode, error, message } = err.message;
      out.statusCode = statusCode;
      out.name = error;
      out.message = message;
    }

    if (!out.statusCode && err.status) {
      out.statusCode = err.status;
    }

    if (!out.message && err.message) {
      out.message = err.message;
    }

    return out;
  }
}
