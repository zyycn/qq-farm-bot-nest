import { IsString, MinLength } from 'class-validator'

export class ChangePasswordDto {
  @IsString()
  oldPassword: string

  @IsString()
  @MinLength(4)
  newPassword: string
}
