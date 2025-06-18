import configs from '../../configs';
import { Request, Response, NextFunction } from 'express';

export function ApiDocRedirectMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
) {
    if (req.originalUrl === '/' || req.originalUrl.includes('favicon.ico')) {
        if (configs.env !== 'production') {
            return res.redirect('/docs-swagger');
        } else {
            return res.send(configs.projectName);
        }
    }

    return next();
}