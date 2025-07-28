import { Repository } from "typeorm";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ContentStream } from "../../domain/entities";
import { IContentStreamRepository } from "../../domain/repositories/icontentStream.repository";

@Injectable()
export class ContentStreamRepository implements IContentStreamRepository {


  constructor(
    @InjectRepository(ContentStream)
    private readonly contentStreamContext: Repository<ContentStream>
  ) { }


}