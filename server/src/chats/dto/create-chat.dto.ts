import {
  IsEnum,
  IsOptional,
  IsString,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';

export class CreateChatDto {
  @IsEnum(['private', 'group'])
  chat_type!: 'private' | 'group';

  @IsOptional()
  @IsString()
  name?: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  member_ids!: string[];
}
