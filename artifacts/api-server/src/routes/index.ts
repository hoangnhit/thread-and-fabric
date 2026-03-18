import { Router, type IRouter } from "express";
import healthRouter from "./health";
import fabricsRouter from "./fabrics";

const router: IRouter = Router();

router.use(healthRouter);
router.use(fabricsRouter);

export default router;
